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
  import CanvasGrip from "./CanvasGrip.svelte";
  import { type Handle, type Stage, slotSizes, stages } from "./stage.svelte";

  /** The handles over the composer: the top grab, then each top corner's grip. */
  const HANDLES: Handle[] = ["top", "top-left", "top-right"];

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
    <!-- The phone's panel is the sheet (--layer-sheet): the canvas stands in
         it (stage.svelte.ts sets data-over-sheet). -->
    <div
      data-standing={stage.at === "composer" || undefined}
      data-canvas-stages-docked={stage.at === "panel" || undefined}
      data-slot="canvas-stage"
      class="fixed z-(--layer-stage) overflow-hidden bg-surface-raised data-canvas-stages-docked:rounded-sm data-over-sheet:z-(--layer-sheet-stage) data-standing:border-b data-standing:border-b-border-hairline"
      data-artifact={stage.id}
      hidden
      bind:this={stage.el}
      {@attach () => {
        stage.place();
      }}
    >
      {#if stage.src}
        <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: load starts the overlay handshake. -->
        <!-- biome-ignore lint/security/useIframeSandbox: the previewed app runs on its own origin (the preview proxy's), which is the boundary; a sandbox would take the forms, popups and downloads it is being tried with. -->
        <iframe
          allow="clipboard-write"
          class="block size-full border-none border-current scheme-inherit"
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
        {#each HANDLES as handle (handle)}
          <CanvasGrip
            corner={stage.corner}
            {handle}
            ondown={(which, event) => stage.grab?.down(which, event)}
            onkey={(which, event) => stage.grab?.key(which, event)}
            text={stage.grabValue.corner.text}
            value={handle === "top"
              ? stage.grabValue.top
              : stage.grabValue.corner}
          />
        {/each}
      {/if}
    </div>
  </Portal>
{/each}
