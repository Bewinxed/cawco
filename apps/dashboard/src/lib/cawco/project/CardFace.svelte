<script lang="ts">
  /**
   * An icon card's face (app.css `.icon-card`): its head, the icon tile
   * (DESIGN.md: the duotone glyph on a raised 26px tile, in its section
   * hue) with whatever stands beside it; its art, where it has one, centred
   * between the head and the name; then its name and its meta line.
   */
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    hue,
    name,
    meta,
    aside,
    art,
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
    /** The card's picture, between the head and the name. */
    art?: Snippet;
  } = $props();
</script>

<span
  data-slot="head"
  class="relative z-2 mb-space-2 flex min-h-(--tile) items-center gap-space-2"
  style:--tile="26px"
>
  <!-- literal: 26px -->
  <span
    data-slot="tile"
    class="inline-grid size-(--tile) flex-none place-items-center rounded-sm bg-surface-tile text-(color:--tile-hue) shadow-tile"
    style:--tile="26px"
    style:--tile-hue={hue}><Icon /></span
  >
  {@render aside?.()}
</span>
{#if art}
  <span class="relative z-2 mb-space-2 self-center">{@render art()}</span>
{/if}
<span data-slot="name" class="type-label relative z-2 font-medium text-ink-strong">{name}</span>
<span data-slot="meta" class="relative z-2 text-ink-muted">{meta}</span>

<style>
  /* residual: foreign-dom */
  [data-slot="tile"] :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
</style>
