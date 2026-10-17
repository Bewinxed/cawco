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
      data-standing={stage.at === "composer" || undefined}
      data-canvas-stages-docked={stage.at === "panel" || undefined}
      data-slot="canvas-stage"
      class="fixed z-15 overflow-hidden bg-surface-raised data-canvas-stages-docked:rounded-sm data-standing:border-b data-standing:border-border-hairline"
      data-artifact={stage.id}
      hidden
      bind:this={stage.el}
      {@attach () => {
        stage.place();
      }}
    >
      {#if stage.src}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
        <iframe
          allow="clipboard-write"
          class="block size-full border-0"
          onload={(event) =>
            loaded(stage, event.currentTarget as HTMLIFrameElement)}
          src={stage.src}
          title="Canvas"
          bind:this={stage.frame}
        ></iframe>
      {:else if stage.unreached}
        <p class="m-0 p-space-4 text-size-body text-data-bad" role="alert">
          {stage.unreached}
        </p>
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
    data-slot="grab"
    aria-label={LABELS[handle]}
    aria-orientation={handle === "top" ? "horizontal" : "vertical"}
    aria-valuemax={Math.round(value?.max ?? 0)}
    aria-valuemin={Math.round(value?.min ?? 0)}
    aria-valuenow={Math.round(value?.now ?? 0)}
    aria-valuetext={stage.grabValue && handle !== "top"
      ? stage.grabValue.corner.text
      : undefined}
    class={[
      "group/grab absolute flex touch-none outline-none",
      handle === "top" &&
        "start-(--grab-x) top-0 h-c-btn-h-lg w-(--grab-w) translate-x-(--grab-shift) cursor-ns-resize justify-center pt-space-1",
      handle === "top-left" &&
        "top-0 size-c-btn-h-lg start-(--corner-in) cursor-nwse-resize transition-[opacity] dur-grow ease-out starting:opacity-0",
      handle === "top-right" &&
        "top-0 size-c-btn-h-lg end-(--corner-in) cursor-nesw-resize justify-end transition-[opacity] dur-grow ease-out starting:opacity-0",
    ]}
    data-canvas-stages-grab={handle}
    onkeydown={(event) => stage.grab?.key(handle, event)}
    onpointerdown={(event) => stage.grab?.down(handle, event)}
    role="separator"
    tabindex="0"
    style:--corner-in={`${stage.corner.inset}px`}
    style:--corner-r={`${stage.corner.radius}px`}
    style:--grab-shift="-50%"
    style:--grab-w="160px"
    style:--grab-x="50%"
  >
    <!-- literal: 100px, 6px (the drawer's grabber); 160px, 50%, -50% (the top grab) -->
    <span
      aria-hidden="true"
      class={[
        "group-focus-visible/grab:outline-(length:--focus-ring-width) group-focus-visible/grab:outline-offset-2 group-focus-visible/grab:outline-focus-ring group-focus-visible/grab:outline-solid",
        handle === "top" &&
          "h-(--grabber-h) w-(--grabber-w) rounded-pill bg-border-control",
        handle !== "top" &&
          "m-c-corner-grip-inset size-c-corner-grip-leg border-t-(length:--c-corner-grip-stroke) border-t-border-control",
        handle === "top-left" &&
          "rounded-ss-(--grip-r) border-s-(length:--c-corner-grip-stroke) border-s-border-control",
        handle === "top-right" &&
          "rounded-se-(--grip-r) border-e-(length:--c-corner-grip-stroke) border-e-border-control",
      ]}
      style:--grabber-h="6px"
      style:--grabber-w="100px"
      style:--grip-r="max(0px, calc(var(--corner-r) - var(--c-corner-grip-inset)))"
    ></span>
  </div>
{/snippet}

<style>
  /* The phone's panel is the sheet (z 40): the canvas stands in it. stage.svelte.ts
     toggles the class. */
  /* residual: unmapped */
  [data-slot="canvas-stage"]:global(.over-sheet) {
    z-index: 41;
  }
  /* residual: unmapped */
  iframe {
    color-scheme: inherit;
  }
</style>
