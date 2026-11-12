<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import {
    IconMaximizeLinear,
    IconMinusLinear,
    IconPlus,
    IconRedoLinear,
    IconUndoLinear,
  } from "#lib/icons.js";

  let {
    zoom,
    pan,
    onpan,
    onzoom,
    onfit,
    fit: framer,
    fitLabel = "Fit graph",
    undo,
    redo,
    canUndo,
    canRedo,
    figure = true,
  }: {
    zoom: number;
    /** The zoom's figure between the buttons; a canvas held at its readable size says none. */
    figure?: boolean;
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
    /** What the fit tool says it does, when the canvas's own fit is not the whole graph. */
    fitLabel?: string;
    /** Undo and redo, for a canvas that is edited; without them there are none. */
    undo?: () => void;
    redo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
  } = $props();
  const { zoomIn, zoomOut, fitView } = useSvelteFlow();
  /** Zoom and fit glide to the new view: movement on screen, --duration-panel. */
  const glide = () => ({
    duration: motionOk.current ? dur("--duration-panel") : 0,
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
<!-- One glass group of bare symbols floating over the canvas (DESIGN.md,
     The Title Bars Follow Liquid Glass Rule: a group is one capsule of the
     panel's glass), each a bar item on the glass's contour, as a head's
     glass draws them; under a finger the glass opens its gap (The 44 Touch
     Rule). The group stands over the canvas, not in its zoom: its areas
     take no --hit-scale from the canvas it floats on. -->
<div class="flex" style:--hit-scale="1">
  <BarGlass form="group">
    {#if onpan}
      <BarItem
        form="words"
        label={pan ? "Pan" : "Select"}
        onclick={() => onpan?.()}
        pressed={pan}
        tip={false}><span>{pan ? "Pan" : "Select"}</span></BarItem
      >
    {/if}
    <BarItem
      icon={IconMinusLinear}
      label="Zoom out"
      onclick={() => zoomBy(zoomOut)}
    />
    {#if figure}<span
        class="min-w-space-8 text-center type-meta num text-ink-strong"
        >{Math.round(zoom * 100)}%</span
      >{/if}
    <BarItem icon={IconPlus} label="Zoom in" onclick={() => zoomBy(zoomIn)} />
    <BarItem
      icon={IconMaximizeLinear}
      keys="F"
      label={fitLabel}
      onclick={fit}
    />
    {#if undo || redo}
      <BarItem
        icon={IconUndoLinear}
        label="Undo"
        onclick={undo}
        props={{ disabled: !canUndo }}
      />
      <BarItem
        icon={IconRedoLinear}
        label="Redo"
        onclick={redo}
        props={{ disabled: !canRedo }}
      />
    {/if}
  </BarGlass>
</div>
