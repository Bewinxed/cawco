<script lang="ts">
  /**
   * Every canvas on screen (stage.svelte.ts), each a fixed layer over the
   * slot it stands in, holding the canvas's one iframe. Over the composer it
   * carries the 44px grab along its top edge (the drawer's grabber, laid
   * flat) that resizes its height, and once it stands still a grab on each
   * side edge (the grabber upright) that resizes its width, in a layer of
   * their own over it. The page's words come here: ready, the picture
   * drawn, and the rail's Dock, Undock, Done and Remove, which go to
   * whoever holds the slot it stands in.
   */
  import { Portal } from "bits-ui";
  import { untrack } from "svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { heardInk } from "../preview/ink.svelte";
  import { watchInput } from "../reload.svelte";
  import {
    type Edge,
    type GrabValue,
    type Stage,
    slotSizes,
    stages,
  } from "./stage.svelte";

  const LABELS: Record<Edge, string> = {
    top: "Canvas height",
    left: "Canvas width, left edge",
    right: "Canvas width, right edge",
  };

  function receive(event: MessageEvent): void {
    if (event.origin !== location.origin) {
      return;
    }
    const stage = [...stages.values()].find(
      (one) => one.frame?.contentWindow === event.source
    );
    const type = event.data?.type;
    if (!stage || typeof type !== "string") {
      return;
    }
    const actions = stage.at ? stage.actions[stage.at] : undefined;
    switch (type) {
      case "cawco:ready":
        stage.connected = true;
        stage.changed();
        break;
      case "cawco:pictured":
        stage.pictured?.();
        break;
      case "cawco:ink":
        // The person's unsent ink on the canvas, which the composer's Send carries.
        if (stage.frame?.contentWindow) {
          heardInk(
            stage.instanceId,
            stage.id,
            stage.frame.contentWindow,
            event.data
          );
        }
        break;
      case "cawco:dock":
        actions?.dock?.();
        break;
      case "cawco:undock":
        actions?.undock?.();
        break;
      case "cawco:done":
        actions?.done?.();
        break;
      case "cawco:remove":
        actions?.remove?.();
        break;
      // A press on an element (no drag), for whoever hosts the dashboard (the Decisions tab);
      // a held stroke snapped to its shape, for the app that plays its selection tick.
      case "cawco:element-press":
      case "cawco:snap":
        window.parent.postMessage(event.data, location.origin);
        break;
      default:
        break;
    }
  }

  function loaded(stage: Stage, frame: HTMLIFrameElement): void {
    try {
      if (frame.contentWindow) {
        watchInput(frame.contentWindow);
      }
    } catch {
      // Same origin always; nothing to hear otherwise.
    }
    stage.hello();
  }

  // The dashboard's theme turning tells every canvas: it draws in the dashboard's scheme, never the OS's.
  $effect(() => {
    const now = theme.resolved;
    for (const stage of untrack(() => [...stages.values()])) {
      stage.tellTheme(now);
    }
  });

  /** Each slot a stage may stand over is watched for its size. */
  $effect(() => {
    for (const stage of stages.values()) {
      for (const slot of Object.values(stage.slots)) {
        if (slot) {
          slotSizes?.observe(slot);
        }
      }
    }
  });
</script>

<svelte:window onmessage={receive} />

{#each [...stages.values()] as stage (stage.id)}
  <Portal>
    <div
      class="canvas-stage"
      data-artifact={stage.id}
      hidden
      bind:this={stage.el}
      class:docked={stage.at === "panel"}
      class:standing={stage.at === "composer"}
      {@attach () => {
        stage.place();
      }}
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
      <iframe
        allow="clipboard-write"
        onload={(event) =>
          loaded(stage, event.currentTarget as HTMLIFrameElement)}
        src={stage.src}
        title="Canvas"
        bind:this={stage.frame}
      ></iframe>
      {#if stage.at === "composer" && stage.grab && stage.grabValue}
        {@render grip(stage, "top", stage.grabValue.top)}
      {/if}
    </div>
    <!-- The side edges' grabs: on the stage's box, not cut to its shape, so
         each 44px hit zone straddles its edge. -->
    {#if stage.at === "composer" &&
      stage.edgesShown &&
      stage.grab &&
      stage.grabValue}
      <div
        class="canvas-edges"
        hidden
        bind:this={stage.edges}
        style:--edge-in={`${stage.edgeInset}px`}
        {@attach () => {
          stage.place();
        }}
      >
        {@render grip(stage, "left", stage.grabValue.left)}
        {@render grip(stage, "right", stage.grabValue.right)}
      </div>
    {/if}
  </Portal>
{/each}

{#snippet grip(
  stage: Stage,
  edge: Edge,
  value: GrabValue
)}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- a focusable separator is a widget (WAI-ARIA window splitter): it takes focus, arrows and a drag. -->
  <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle is a focusable separator (WAI-ARIA window splitter); <hr> takes no focus or keys. -->
  <div
    aria-label={LABELS[edge]}
    aria-orientation={edge === "top" ? "horizontal" : "vertical"}
    aria-valuemax={Math.round(value.max)}
    aria-valuemin={Math.round(value.min)}
    aria-valuenow={Math.round(value.now)}
    class="grab grab-{edge}"
    onkeydown={(event) => stage.grab?.key(edge, event)}
    onpointerdown={(event) => stage.grab?.down(edge, event)}
    role="separator"
    tabindex="0"
  >
    <span
      aria-hidden="true"
      class="grabber"
      class:grabber-upright={edge !== "top"}
    ></span>
  </div>
{/snippet}

<style>
  /* Over the transcript and the side card, under the composer's own
     floating parts (its `/` menu, z 20) and every popover. */
  .canvas-stage {
    position: fixed;
    z-index: 15;
    overflow: hidden;
    background: var(--surface-raised);
  }
  .canvas-stage[hidden] {
    display: none;
  }
  /* In the panel it fills the well, inside its edge. */
  .canvas-stage.docked {
    border-radius: var(--radius-sm);
  }
  /* The phone's panel is the sheet (z 40): the canvas stands in it. */
  .canvas-stage:global(.over-sheet) {
    z-index: 41;
  }
  /* Over the field, its foot meets the field on a hairline. */
  .canvas-stage.standing {
    border-block-end: 1px solid var(--border-hairline);
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    color-scheme: inherit;
  }
  .grabber {
    inline-size: 100px;
    block-size: 6px;
    border-radius: var(--radius-pill);
    background: var(--border-control);
  }
  .grab {
    position: absolute;
    display: flex;
    touch-action: none;
    outline: none;

    &:focus-visible .grabber {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  /* The top edge's grab: a 44px band between the rail's two groups, the
     drawer's 100×6 grabber in it. */
  .grab-top {
    inset-block-start: 0;
    inset-inline-start: 50%;
    translate: -50% 0;
    justify-content: center;
    inline-size: 160px;
    block-size: 44px;
    padding-block-start: var(--space-1);
    cursor: ns-resize;
  }
  /* The side edges' grabs, over the stage on its box and never cut to its
     shape: each a 44px band straddling its edge where the shape's side
     stands at mid-height (`--edge-in`, the shoulder's curve in), the
     grabber upright (6×100) just inside it. They fade in once the canvas
     stands still. */
  .canvas-edges {
    position: fixed;
    z-index: 15;
    pointer-events: none;
    transition: opacity var(--dur-fade) var(--ease-out);

    @starting-style {
      opacity: 0;
    }
  }
  .canvas-edges[hidden] {
    display: none;
  }
  .grab-left,
  .grab-right {
    --half: calc(var(--c-btn-h-lg) / 2);
    inset-block-start: 50%;
    translate: 0 -50%;
    align-items: center;
    inline-size: var(--c-btn-h-lg);
    block-size: 160px;
    cursor: ew-resize;
    pointer-events: auto;
  }
  .grabber-upright {
    inline-size: 6px;
    block-size: 100px;
  }
  .grab-left {
    left: calc(var(--edge-in) - var(--half));
    padding-inline-start: calc(var(--half) + var(--space-1));
  }
  .grab-right {
    right: calc(var(--edge-in) - var(--half));
    justify-content: flex-end;
    padding-inline-end: calc(var(--half) + var(--space-1));
  }
</style>
