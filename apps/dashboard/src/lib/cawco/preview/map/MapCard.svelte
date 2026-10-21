<script lang="ts" module>
  import type { CanvasMapNode } from "@cawco/core/stage";

  /** Where a component stands on the map: the canvas's own, what renders it, what it renders. */
  export type MapRole = "center" | "usedIn" | "madeOf";

  export interface MapCardData {
    /** The one the map draws live. */
    chosen: boolean;
    /** Utilities for the card's root, where the surface it stands in sizes it. */
    class?: string;
    /** Its canvas page's address, drawn live while chosen; null while the pane's own page has not loaded. */
    live: string | null;
    node: CanvasMapNode;
    onchoose: (file: string) => void;
    role: MapRole;
  }
</script>

<script lang="ts">
  /**
   * One component on a canvas's map (CanvasMap), on the graph and in the
   * phone's list alike: its name, file and counts as one button that
   * chooses it (stretched over the whole card, so a press on its frames
   * chooses it too), over its frames at 16:10, the report's thumbnail, or, once
   * chosen, its canvas page live: a second page of it (`by=map`, which
   * never posts a report) laid out at the tablet form's width and scaled to
   * the card, input left to the map. A component with no states file has
   * no canvas to draw, so it can't be chosen.
   */
  import { FORMS } from "@cawco/core/stage";
  import { cn } from "#lib/utils.js";
  import MapThumb from "./MapThumb.svelte";

  let {
    chosen,
    class: className,
    live,
    node,
    onchoose,
    role,
  }: MapCardData = $props();

  const choosable = $derived(node.statesFiles.length > 0);
  const counts = $derived(
    choosable || node.states > 0
      ? `${node.states} ${node.states === 1 ? "state" : "states"} · ${node.drawn} drawn`
      : "No states file"
  );
  /** Where the call stands, when a draw saw it: the button's tooltip, with its file. */
  const where = $derived(
    node.at
      ? `${node.file}, ${role === "usedIn" ? "rendering it at" : "rendered at"} ${node.at}`
      : node.file
  );
  /** Its folder and file: the name above says which component, and a long path's prefix would take the card's width. The whole path is the tooltip's. */
  const shortFile = $derived(node.file.split("/").slice(-2).join("/"));
  /** The live page's room: the tablet form's width at the view's 16:10, scaled to the card's width. */
  const LIVE = { w: FORMS.tablet, h: (FORMS.tablet * 10) / 16 };
  let viewWidth = $state(0);
</script>

<div
  data-slot="map-card"
  class={cn(
    "relative grid w-c-map-node-w gap-space-2 rounded-lg bg-surface-raised p-space-2 shadow-tile data-chosen:inset-ring-1 data-chosen:inset-ring-brand-solid",
    className
  )}
  data-chosen={chosen || undefined}
  data-role={role}
>
  <button
    aria-pressed={chosen}
    class="select-none grid gap-space-row min-w-0 p-space-1 border-none border-current rounded-sm bg-transparent text-start enabled:aria-pressed-false:hover:bg-surface-hover after:absolute after:inset-0 after:z-1 after:rounded-lg"
    disabled={!choosable}
    onclick={() => onchoose(node.file)}
    title={choosable
      ? where
      : `${where}: no states file, so nothing to draw live`}
    type="button"
  >
    <span class="flex items-center gap-space-2 min-w-0">
      <span
        data-slot="map-name"
        class="min-w-0 truncate text-ink-strong type-label">{node.name}</span
      >
      {#if role === "center"}
        <span
          class="flex-none px-space-2 rounded-pill bg-selected-bg text-selected-ink type-meta"
          >This canvas</span
        >
      {/if}
    </span>
    <span class="min-w-0 truncate text-ink-muted type-meta">{shortFile}</span>
    <span data-slot="map-counts" class="text-ink-muted type-meta num"
      >{counts}</span
    >
  </button>
  <div
    class="relative aspect-16/10 overflow-hidden rounded-md bg-surface-recess"
    bind:clientWidth={viewWidth}
  >
    {#if chosen && live}
      <iframe
        class="absolute top-0 start-0 w-(--live-w) h-(--live-h) scale-(--live-scale) origin-top-left border-none border-current pointer-events-none bg-surface-well"
        style:--live-h={`${LIVE.h}px`}
        style:--live-scale={viewWidth / LIVE.w}
        style:--live-w={`${LIVE.w}px`}
        inert
        src={live}
        tabindex="-1"
        title={`${node.name}, live`}
      ></iframe>
    {:else}
      <MapThumb name={node.name} thumb={node.thumb} />
    {/if}
  </div>
</div>
