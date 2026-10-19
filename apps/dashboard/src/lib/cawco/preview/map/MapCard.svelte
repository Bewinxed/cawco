<script lang="ts" module>
  import type { CanvasMapNode } from "@cawco/core/stage";

  /** Where a component stands on the map: the canvas's own, what renders it, what it renders. */
  export type MapRole = "center" | "usedIn" | "madeOf";

  export interface MapCardData {
    /** The one the map draws live. */
    chosen: boolean;
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
  import MapThumb from "./MapThumb.svelte";

  let { chosen, live, node, onchoose, role }: MapCardData = $props();

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
  class="map-card"
  data-chosen={chosen || undefined}
  data-role={role}
>
  <button
    aria-pressed={chosen}
    class="choose"
    disabled={!choosable}
    onclick={() => onchoose(node.file)}
    title={choosable
      ? where
      : `${where}: no states file, so nothing to draw live`}
    type="button"
  >
    <span class="line">
      <span data-slot="map-name" class="name">{node.name}</span>
      {#if role === "center"}
        <span class="tag">This canvas</span>
      {/if}
    </span>
    <span class="file">{shortFile}</span>
    <span data-slot="map-counts" class="counts">{counts}</span>
  </button>
  <div class="view" bind:clientWidth={viewWidth}>
    {#if chosen && live}
      <iframe
        style:block-size={`${LIVE.h}px`}
        style:inline-size={`${LIVE.w}px`}
        style:scale={viewWidth / LIVE.w}
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

<style>
  .map-card {
    position: relative;
    display: grid;
    gap: var(--space-2);
    inline-size: var(--c-map-node-w);
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  /* The chosen one takes the coral edge, as a chosen chip does. */
  .map-card[data-chosen] {
    box-shadow:
      inset 0 0 0 1px var(--brand-solid),
      var(--shadow-tile);
  }
  .choose {
    display: grid;
    gap: var(--space-row);
    min-inline-size: 0;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    text-align: start;
    cursor: pointer;

    /* The whole card is the button's: a press on its frames chooses it too. */
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 1;
      border-radius: var(--radius-lg);
    }
    &:disabled {
      cursor: default;
    }
    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }
    @media (hover: hover) {
      &:not(:disabled, [aria-pressed="true"]):hover {
        background: var(--surface-hover);
      }
    }
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .name,
  .file {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .tag {
    flex: none;
    padding-inline: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--selected-bg);
    color: var(--selected-ink);
    font: var(--type-meta);
  }
  .file,
  .counts {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .counts {
    font-variant-numeric: tabular-nums;
  }
  .view {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--surface-recess);

    & > :global([data-slot="map-thumb"]) {
      box-sizing: border-box;
      padding: var(--space-2);
    }
  }
  iframe {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    border: 0;
    transform-origin: 0 0;
    pointer-events: none;
    background: var(--surface-well);
  }
</style>
