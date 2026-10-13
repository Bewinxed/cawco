<script lang="ts">
  /**
   * Every canvas on screen (stage.svelte.ts), each a fixed layer over the
   * slot it stands in, holding the canvas's one iframe. Over the composer it
   * carries the 44px grab along its top edge (the drawer's grabber, laid
   * flat) that resizes it. The page's words come here: ready, the picture
   * drawn, and the rail's Dock, Undock and Done, which go to whoever holds
   * the slot it stands in.
   */
  import { Portal } from "bits-ui";
  import { heardInk } from "../preview/ink.svelte";
  import { watchInput } from "../reload.svelte";
  import { type Stage, slotSizes, stages } from "./stage.svelte";

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
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- a focusable separator is a widget (WAI-ARIA window splitter): it takes focus, arrows and a drag. -->
        <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle is a focusable separator (WAI-ARIA window splitter); <hr> takes no focus or keys. -->
        <div
          aria-label="Canvas height"
          aria-orientation="horizontal"
          aria-valuemax={Math.round(stage.grabValue.max)}
          aria-valuemin={Math.round(stage.grabValue.min)}
          aria-valuenow={Math.round(stage.grabValue.now)}
          class="grab"
          onkeydown={(event) => stage.grab?.key(event)}
          onpointerdown={(event) => stage.grab?.down(event)}
          role="separator"
          tabindex="0"
        >
          <span aria-hidden="true" class="grabber"></span>
        </div>
      {/if}
    </div>
  </Portal>
{/each}

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
  /* The top edge's grab: a 44px band between the rail's two groups, the
     drawer's 100×6 grabber in it. */
  .grab {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 50%;
    translate: -50% 0;
    display: flex;
    justify-content: center;
    inline-size: 160px;
    block-size: 44px;
    padding-block-start: var(--space-1);
    cursor: ns-resize;
    touch-action: none;
    outline: none;

    &:focus-visible .grabber {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
</style>
