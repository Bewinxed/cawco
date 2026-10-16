<script lang="ts">
  /**
   * Every canvas on screen (stage.svelte.ts), each a fixed layer over the
   * slot it stands in, holding the canvas's one iframe. Over the composer
   * its top edge is our chrome, a 44px band (the page's rail stands under
   * it): the grab in its middle (the drawer's grabber, laid flat) resizes
   * its height, and a resize handle at each top corner (the typical corner
   * grip) resizes its width, both sides at once, and its height. The
   * handles are cut to the grown shape with the canvas, so they come in as
   * it grows. The page's words come here: ready, the picture drawn, its
   * doc's link to the hub and its count, kept on its stage, and the rail's
   * Dock, Undock, Done and Remove, which go to whoever holds the slot it
   * stands in.
   */
  import { PREVIEW_LOCKED_MESSAGE } from "@cawco/core";
  import { Portal } from "bits-ui";
  import { untrack } from "svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { heardInk } from "../preview/ink.svelte";
  import { previewShortcut, SHORTCUT_MESSAGE } from "../preview/wire";
  import { watchInput } from "../reload.svelte";
  import { runShellShortcut } from "../shell-shortcut";
  import { type Handle, type Stage, slotSizes, stages } from "./stage.svelte";

  const LABELS: Record<Handle, string> = {
    top: "Canvas height",
    "top-left": "Canvas size, top-left corner",
    "top-right": "Canvas size, top-right corner",
  };

  function receive(event: MessageEvent): void {
    // A canvas's own frame, from its own preview origin: nothing else is heard.
    const stage = [...stages.values()].find(
      (one) => one.frame?.contentWindow === event.source
    );
    const type = event.data?.type;
    if (!stage || event.origin !== stage.origin || typeof type !== "string") {
      return;
    }
    const actions = stage.at ? stage.actions[stage.at] : undefined;
    switch (type) {
      case "cawco:ready":
        stage.connected = true;
        stage.admitted();
        stage.changed();
        break;
      // Host mode: the canvas's pass lapsed, and it enters again.
      case PREVIEW_LOCKED_MESSAGE:
        stage.turnedAway();
        break;
      case "cawco:pictured":
        stage.pictured?.();
        break;
      // Whether the page's doc reached the hub, and how much it holds: what a send waits on.
      case "cawco:sync":
        stage.heardLink(event.data.state, event.data.error);
        break;
      case "cawco:drawn":
        stage.heardDrawn(event.data.count);
        break;
      case "cawco:ink":
        // The person's unsent ink on the canvas, which the composer's Send carries.
        if (stage.frame?.contentWindow && stage.origin) {
          heardInk(
            stage.instanceId,
            stage.id,
            stage.frame.contentWindow,
            stage.origin,
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
      case SHORTCUT_MESSAGE: {
        // A shell combo the canvas left unhandled: the shell's, as from its own keys.
        const name = previewShortcut(event.data);
        if (name) {
          runShellShortcut(name);
        }
        break;
      }
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
      // Its own origin: its input is not ours to hear.
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
      {#if stage.src}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
        <iframe
          allow="clipboard-write"
          onload={(event) =>
            loaded(stage, event.currentTarget as HTMLIFrameElement)}
          src={stage.src}
          title="Canvas"
          bind:this={stage.frame}
        ></iframe>
      {:else if stage.unreached}
        <p class="unreached" role="alert">{stage.unreached}</p>
      {/if}
      {#if stage.at === "composer" && stage.grab && stage.grabValue}
        {@render grip(stage, "top")}
        {@render grip(stage, "top-left")}
        {@render grip(stage, "top-right")}
      {/if}
    </div>
  </Portal>
{/each}

{#snippet grip(stage: Stage, handle: Handle)}
  {@const value =
    handle === "top" ? stage.grabValue?.top : stage.grabValue?.corner}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- a focusable separator is a widget (WAI-ARIA window splitter): it takes focus, arrows and a drag. -->
  <!-- biome-ignore lint/a11y/useSemanticElements: a resize handle is a focusable separator (WAI-ARIA window splitter); <hr> takes no focus or keys. -->
  <div
    aria-label={LABELS[handle]}
    aria-orientation={handle === "top" ? "horizontal" : "vertical"}
    aria-valuemax={Math.round(value?.max ?? 0)}
    aria-valuemin={Math.round(value?.min ?? 0)}
    aria-valuenow={Math.round(value?.now ?? 0)}
    aria-valuetext={stage.grabValue && handle !== "top"
      ? stage.grabValue.corner.text
      : undefined}
    class="grab grab-{handle}"
    onkeydown={(event) => stage.grab?.key(handle, event)}
    onpointerdown={(event) => stage.grab?.down(handle, event)}
    role="separator"
    tabindex="0"
    style:--corner-in={`${stage.corner.inset}px`}
    style:--corner-r={`${stage.corner.radius}px`}
  >
    <span
      aria-hidden="true"
      class={handle === "top" ? "grabber" : "corner-grip"}
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
  /* The hub named no origin for it: its sentence, where the canvas would be. */
  .unreached {
    margin: 0;
    padding: var(--space-4);
    color: var(--data-bad);
    font-size: var(--text-body);
  }
  .grabber {
    inline-size: 100px;
    block-size: 6px;
    border-radius: var(--radius-pill);
    background: var(--border-control);
  }
  /* A top corner's grip (the corner handles below): an L along its corner's
     two edges, concentric with the corner's radius. */
  .corner-grip {
    --grip-r: max(0px, calc(var(--corner-r) - var(--c-corner-grip-inset)));
    margin: var(--c-corner-grip-inset);
    inline-size: var(--c-corner-grip-leg);
    block-size: var(--c-corner-grip-leg);
    border-block-start: var(--c-corner-grip-stroke) solid var(--border-control);
  }
  .grab-top-left .corner-grip {
    border-inline-start: var(--c-corner-grip-stroke) solid var(--border-control);
    border-start-start-radius: var(--grip-r);
  }
  .grab-top-right .corner-grip {
    border-inline-end: var(--c-corner-grip-stroke) solid var(--border-control);
    border-start-end-radius: var(--grip-r);
  }
  .grab {
    position: absolute;
    display: flex;
    touch-action: none;
    outline: none;

    &:focus-visible .grabber,
    &:focus-visible .corner-grip {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  /* The top edge's grab: in the middle of the 44px band over the canvas
     (the page's rail stands under it), the drawer's 100×6 grabber in it. */
  .grab-top {
    inset-block-start: 0;
    inset-inline-start: 50%;
    translate: -50% 0;
    justify-content: center;
    inline-size: 160px;
    block-size: var(--c-btn-h-lg);
    padding-block-start: var(--space-1);
    cursor: ns-resize;
  }
  /* A top corner's resize handle: a 44px zone at the shape's corner
     (`--corner-in` in from the box's side, where the shoulder's curve puts
     it), drawn as the typical corner grip: an L whose legs run along the
     corner's two edges, --c-corner-grip-inset inside it and concentric with
     its radius (`--corner-r`), so it sits under the curve. It comes in with
     the grown shape, which cuts it, fades in, and stays. */
  .grab-top-left,
  .grab-top-right {
    inset-block-start: 0;
    inline-size: var(--c-btn-h-lg);
    block-size: var(--c-btn-h-lg);
    transition: opacity var(--dur-grow) var(--ease-out);

    @starting-style {
      opacity: 0;
    }
  }
  .grab-top-left {
    inset-inline-start: var(--corner-in);
    cursor: nwse-resize;
  }
  .grab-top-right {
    inset-inline-end: var(--corner-in);
    justify-content: flex-end;
    cursor: nesw-resize;
  }
</style>
