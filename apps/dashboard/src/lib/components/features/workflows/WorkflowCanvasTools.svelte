<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconMinus, IconPlus, IconReset } from "#lib/icons.js";

  let {
    zoom,
    pan,
    onpan,
    onzoom,
    onfit,
    fit: framer,
    undo,
    redo,
    canUndo,
    canRedo,
  }: {
    zoom: number;
    /**
     * The pan / select switch, for a canvas that is edited; a canvas that
     * is only read pans on any drag and has none.
     */
    pan?: boolean;
    onpan?: () => void;
    /** The person zoomed with a button: the view is theirs. */
    onzoom: () => void;
    /** The person asked for the fit: the view is a fit again. */
    onfit: () => void;
    /** The canvas's own way to frame its graph; without it, Svelte Flow's fit. */
    fit?: () => void;
    /** Undo and redo, for a canvas that is edited; without them there are none. */
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
  } = $props();
  const { zoomIn, zoomOut, fitView } = useSvelteFlow();
  /** Zoom and fit glide to the new view: movement on screen, --dur-panel. */
  const glide = () => ({
    duration: motionOk.current ? dur("--dur-panel") : 0,
    ease: easeInOut,
  });
  const fit = () => {
    onfit();
    if (framer) {
      framer();
      return;
    }
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
<!-- Under a finger the cluster opens its gap (DESIGN.md, The 44 Touch
     Rule), so each control's 44px area stands clear of its neighbours'.
     The bar stands over the canvas, not in its zoom: its areas take no
     --hit-scale from the canvas it floats on. -->
<div
  data-slot="tools"
  style:--hit-scale="1"
  class="flex items-center gap-space-1 rounded-lg bg-surface-raised p-space-1 text-ink-strong shadow-tile coarse:gap-space-3"
>
  {#if onpan}
    <Toggle
      onPressedChange={() => onpan?.()}
      pressed={pan}
      type="button"
      variant="outline"
    >
      {pan ? "Pan" : "Select"}
    </Toggle>
  {/if}
  <Tip label="Zoom out">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Zoom out"
        onclick={() => zoomBy(zoomOut)}
        size="icon"
        type="button"
        variant="outline"
      >
        <IconMinus class="size-icon-md" />
      </Button>
    {/snippet}
  </Tip><span class="min-w-space-8 text-center type-meta num"
    >{Math.round(zoom * 100)}%</span
  ><Tip label="Zoom in">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Zoom in"
        onclick={() => zoomBy(zoomIn)}
        size="icon"
        type="button"
        variant="outline"
      >
        <IconPlus class="size-icon-md" />
      </Button>
    {/snippet}
  </Tip>
  <Tip keys="F" label="Fit graph">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Fit graph"
        onclick={fit}
        size="icon"
        type="button"
        variant="outline"
      >
        <IconMaximize class="size-icon-md" />
      </Button>
    {/snippet}
  </Tip>
  {#if undo || redo}
    <Tip label="Undo">
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label="Undo"
          disabled={!canUndo}
          onclick={undo}
          size="icon"
          type="button"
          variant="outline"
        >
          <IconReset class="size-icon-md" />
        </Button>
      {/snippet}
    </Tip><Tip label="Redo">
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label="Redo"
          disabled={!canRedo}
          onclick={redo}
          size="icon"
          type="button"
          variant="outline"
        >
          <IconReset class="size-icon-md rotate-180" />
        </Button>
      {/snippet}
    </Tip>
  {/if}
</div>
