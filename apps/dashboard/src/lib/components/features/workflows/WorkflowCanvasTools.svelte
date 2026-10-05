<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconPlus, IconReset } from "#lib/icons.js";

  let {
    zoom,
    pan,
    onpan,
    onzoom,
    onfit,
    undo,
    redo,
    canUndo,
    canRedo,
  }: {
    zoom: number;
    pan: boolean;
    onpan: () => void;
    /** The person zoomed with a button: the view is theirs. */
    onzoom: () => void;
    /** The person asked for the fit: the view is a fit again. */
    onfit: () => void;
    undo?: () => void;
    redo?: () => void;
    canUndo: boolean;
    canRedo: boolean;
  } = $props();
  const { zoomIn, zoomOut, fitView } = useSvelteFlow();
  /** Zoom and fit glide to the new view: movement on screen, --dur-panel. */
  const glide = () => ({
    duration: motionOk.current ? dur("--dur-panel") : 0,
    ease: easeInOut,
  });
  const fit = () => {
    onfit();
    fitView({ padding: 0.2, ...glide() });
  };
  const zoomBy = (step: typeof zoomIn) => {
    onzoom();
    step(glide());
  };
</script>
<svelte:window
  onkeydown={(event) => {
    if (
      event.key.toLowerCase() === "f" &&
      !(
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
    ) {
      event.preventDefault();
      fit();
    }
  }}
/>
<div class="tools wf">
  <button aria-pressed={pan} class="wf-btn" onclick={onpan} type="button">
    {pan ? "Pan" : "Select"}
  </button>
  <Tip label="Zoom out">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Zoom out"
        class="wf-btn"
        onclick={() => zoomBy(zoomOut)}
        type="button"
      >
        −
      </button>
    {/snippet}
  </Tip><span>{Math.round(zoom * 100)}%</span
  ><Tip label="Zoom in">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Zoom in"
        class="wf-btn"
        onclick={() => zoomBy(zoomIn)}
        type="button"
      >
        <IconPlus class="size-4" />
      </button>
    {/snippet}
  </Tip>
  <Tip keys="F" label="Fit graph">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Fit graph"
        class="wf-btn"
        onclick={fit}
        type="button"
      >
        <IconMaximize class="size-4" />
      </button>
    {/snippet}
  </Tip>
  <Tip label="Undo">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Undo"
        class="wf-btn"
        disabled={!canUndo}
        onclick={undo}
        type="button"
      >
        <IconReset class="size-4" />
      </button>
    {/snippet}
  </Tip><Tip label="Redo">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Redo"
        class="wf-btn"
        disabled={!canRedo}
        onclick={redo}
        type="button"
      >
        <IconReset class="size-4 rotate-180" />
      </button>
    {/snippet}
  </Tip>
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
