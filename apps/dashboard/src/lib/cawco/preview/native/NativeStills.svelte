<script lang="ts">
  /**
   * A component canvas's section for a native screen: one still per state
   * (default, pressed, dark, iPad wide), the app's view tree drawn over
   * each as boxes (NodeTree), invisible until hovered or picked; Wire draws
   * every box, the stills dimmed. The section is named in the title role
   * over its file in meta (DESIGN.md, A component canvas's page), with when
   * and where its stills were drawn; an edge labelled "tap" runs from
   * Default to Pressed.
   *
   * Each still's pixels are a stand-in (AppStandIn), captioned so.
   */
  import { IconArrowDown, IconArrowRight } from "#lib/icons.js";
  import AppStandIn, { screenShape } from "./AppStandIn.svelte";
  import { DEVICE, PIN } from "./fixture";
  import NodeTree from "./NodeTree.svelte";

  let {
    wire = false,
    drawn = true,
  }: {
    /** The section says when its stills were drawn (the panel's head says it otherwise); it always says where. */
    drawn?: boolean;
    /** Every box of each still's tree drawn, the stills dimmed. */
    wire?: boolean;
  } = $props();

  type Still = "Default" | "Pressed" | "Dark" | "iPad wide";
  const roots = $state<Partial<Record<Still, HTMLElement>>>({});
</script>

{#snippet still(name: Still)}
  {@const wide = name === "iPad wide"}
  <figure
    class="m-0 grid min-w-0 max-w-full grid-cols-1 gap-space-2"
    data-still={name}
  >
    <figcaption class="text-ink-muted type-meta">{name}</figcaption>
    <div
      class={[
        "relative aspect-(--shape)",
        wide ? "w-c-bench-side-w" : "w-c-canvas-skeleton-w",
        "max-w-full",
      ]}
      style:--shape={screenShape(wide)}
    >
      <div
        class="size-full overflow-hidden rounded-lg border border-border-well shadow-tile transition-opacity duration-(--dur-control) ease-out data-wire:opacity-40"
        data-wire={wire || undefined}
      >
        <AppStandIn
          bind:root={roots[name]}
          pressed={name === "Pressed"}
          scheme={name === "Dark" ? "dark" : "light"}
          {wide}
        />
      </div>
      <NodeTree
        picked={name === "Default"}
        pin={name === "Default" ? PIN.number : null}
        root={roots[name]}
        {wire}
      />
    </div>
  </figure>
{/snippet}

<section
  aria-label="Project page"
  class="@container/stills grid min-w-0 grid-cols-1 content-start gap-space-4 p-space-5"
  data-slot="native-stills"
>
  <header class="grid gap-space-1">
    <h3 class="m-0 text-ink-strong type-title text-balance">Project page</h3>
    <span class="text-ink-muted type-meta wrap-anywhere">
      <span class="type-code liga-none"
        >ios/CawCo/ProjectViewController.swift</span
      >
      · {#if drawn}drawn <span class="num">12 s</span> ago
      {/if}on {DEVICE.machine}
    </span>
    <span class="text-ink-muted type-meta">Stand-ins for the app's screens</span
    >
  </header>
  <div class="flex flex-wrap items-start gap-space-6">
    <!-- Default, the tap, Pressed: one flow, kept together, the edge a
         line from one still to the other with its label on it; it runs
         down between them where they stack. -->
    <div
      class="flex w-full items-center @max-phone/stills:flex-col @max-phone/stills:items-start"
    >
      {@render still("Default")}
      <div
        class="mark-line flex min-w-space-8 flex-1 items-center self-center text-ink-strong @max-phone/stills:min-h-space-8 @max-phone/stills:w-auto @max-phone/stills:flex-col @max-phone/stills:ms-space-8"
        data-edge="tap"
      >
        <span
          class="h-px flex-1 bg-border-control-strong @max-phone/stills:h-auto @max-phone/stills:min-h-space-4 @max-phone/stills:w-px"
          data-box
        ></span>
        <span
          class="rounded-pill border border-border-control-strong bg-surface-raised px-space-2 type-label"
          data-box>tap</span
        >
        <span
          class="h-px flex-1 bg-border-control-strong @max-phone/stills:h-auto @max-phone/stills:min-h-space-4 @max-phone/stills:w-px"
          data-box
        ></span>
        <IconArrowRight
          class="-ms-space-1 size-icon-md flex-none text-border-control-strong @max-phone/stills:hidden"
        />
        <IconArrowDown
          class="-mt-space-1 hidden size-icon-md flex-none text-border-control-strong @max-phone/stills:block"
        />
      </div>
      {@render still("Pressed")}
    </div>
    {@render still("Dark")}
    {@render still("iPad wide")}
  </div>
</section>
