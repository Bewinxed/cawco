<script lang="ts">
  /**
   * An icon card's face (app.css `.icon-card`): its head, the icon tile
   * (DESIGN.md: the duotone glyph on a raised 26px tile, in its section
   * hue) with whatever stands beside it; then its name and its meta line.
   */
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    hue,
    name,
    meta,
    aside,
  }: {
    /** Its glyph on the tile (Solar duotone). */
    icon: Component;
    /** The tile glyph's section hue. */
    hue: string;
    name: string;
    /** One sentence-case line under the name. */
    meta: string;
    /** What stands in the head beside the tile. */
    aside?: Snippet;
  } = $props();
</script>

<span class="head">
  <span class="tile" style:color={hue}><Icon /></span>
  {@render aside?.()}
</span>
<span class="name">{name}</span>
<span class="meta">{meta}</span>

<style>
  /* Over the card's highlight layers. */
  .head,
  .name,
  .meta {
    position: relative;
    z-index: 2;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 26px;
    margin-block-end: var(--space-2);
  }
  .tile {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--radius-sm);
    background: var(--surface-tile);
    box-shadow: var(--shadow-tile);
  }
  .tile :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .name {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .meta {
    color: var(--ink-muted);
  }
</style>
