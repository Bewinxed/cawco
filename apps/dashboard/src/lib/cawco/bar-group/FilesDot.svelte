<script lang="ts">
  /**
   * FilesItem with a mark for new files, the alternative the bar group's
   * decision page shows beside FilesItem itself (no mark): the same item
   * (Shell's `.bar-item`, its classes, its Tip, Solar's `folder-2`) with
   * the count gone, and while anything new has landed since Files was last
   * opened, a 6px dot on the folder's upper-trailing corner, centred at
   * (23, 5) of the 28px item, in the brand's solid ink (a mark with no
   * text: DESIGN.md, `brand-solid`), never a status ink. A 1.5px ring round
   * it (radius 4.5) is cut from the folder. It clears when Files opens.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconFiles } from "#lib/icons.js";
  import { barGlass } from "../bar-glass.svelte";

  let {
    fresh,
  }: {
    /** Something landed since Files was last opened. */
    fresh: boolean;
  } = $props();

  const marked = $derived(fresh && barGlass.open !== "files");
</script>

<Tip label="Files">
  {#snippet children(tip)}
    <button
      data-bar-item
      {...tip}
      aria-haspopup="dialog"
      aria-label={marked ? "Files, new since you looked" : "Files"}
      class="bar-item files mark-line touch-hit press-tint"
      data-files-control
      data-fresh={marked || undefined}
      type="button"
    >
      <IconFiles aria-hidden="true" class="bar-symbol" data-files-glyph />
      {#if marked}
        <span data-slot="dot" aria-hidden="true" class="dot" data-box></span>
      {/if}
    </button>
  {/snippet}
</Tip>

<style>
  /* The folder's box is the item's less 4px a side: the dot's centre
     (23, 5) is (19, 1) in it. */
  .files[data-fresh] :global(.bar-symbol) {
    mask: radial-gradient(circle at 19px 1px, transparent 4.5px, #000 4.5px);
  }
  .dot {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-end: 2px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--radius-pill);
    background: var(--brand-solid);
    pointer-events: none;
  }
</style>
