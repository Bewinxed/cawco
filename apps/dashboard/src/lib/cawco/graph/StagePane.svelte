<script lang="ts">
  /**
   * The stage's panel (the design graph's spec, The stage): the kept
   * state's name at its head, and under it the frame that holds the stage
   * page (stage-host canvas stage.ts), where the real component stands in
   * that state, live, at 1:1, on the page it lives on with the page's
   * gutter round it, in the scheme and at the width he picked. The page
   * lives on the stage's origin, so the panel draws only what surrounds
   * it; what the drawing needs across, the page says (`laid`), and the
   * split gives the stage that and no more.
   *
   * One panel, as the room beside it is one: the same corner, edge and
   * raised head, the two sharing a top and a foot. Its head holds the kept
   * state's name on the head line the room's faces stand on, its inset the
   * page's gutter, so the name and the drawing share one leading edge.
   */
  import type { StageLaid } from "@cawco/core/stage-graph";
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";

  let {
    name,
    scale = null,
    variant = null,
    stale = false,
    laid,
    frame,
    need = $bindable(0),
  }: {
    /** The kept state's name. */
    name: string;
    /** The variant's name, when it is not the state as written. */
    variant?: string | null;
    /** How the drawing is scaled down to stand whole, in words ("Scaled to 54%"); null at 1:1. */
    scale?: string | null;
    /** The hub's link is down: this is the last drawing. */
    stale?: boolean;
    /** How the page laid the drawing out; null until it has. */
    laid: StageLaid | null;
    /** The frame that holds the stage page, filling the field. */
    frame: Snippet;
    /**
     * The width the stage asks of its column, px: what the page needs
     * across and the panel round it (its edge). 0 until the page has laid
     * the drawing out.
     */
    need?: number;
  } = $props();

  /** The panel's own width less its field's: its edge. */
  let edge = $state(-1);
  $effect(() => {
    need = laid && edge >= 0 ? Math.ceil(laid.need + edge) : 0;
  });
</script>

<section
  data-slot="stage"
  aria-label={name}
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
>
  <!-- Its head, the room's alike: a panel's raised head on the graph's
       page, under the graph's bar, the one bar; its seam the room's. -->
  <div
    data-slot="stage-head"
    class="flex min-w-0 flex-none flex-col border-b border-border-hairline px-space-4"
  >
    <div
      class="flex min-h-c-top-bar-h min-w-0 items-center gap-x-space-3 overflow-clip"
    >
      <h2 class="m-0 min-w-0 flex-none type-title text-ink-strong">
        <span class="block truncate">{name}</span>
      </h2>
      {#if variant}
        <span class="min-w-0 truncate type-label text-ink-muted">{variant}</span
        >
      {/if}
      {#if scale}
        <!-- Not 1:1: what the person judges is scaled, and says so. -->
        <span
          class="ms-auto flex-none type-meta text-ink-muted num"
          data-slot="stage-scale">{scale}</span
        >
      {/if}
    </div>
    {#if stale}
      <p
        data-slot="stage-stale"
        role="status"
        class="m-0 pb-space-3 type-meta text-status-attn-ink"
      >
        {words.stale}
      </p>
    {/if}
  </div>
  <!-- The field: the frame holding the stage page fills it; the page is
       its own scroller, its own page and gutter round the drawing. -->
  <div
    data-slot="stage-field"
    class="relative min-h-0 min-w-0 flex-1 bg-surface-page"
    {@attach frameSize((node: HTMLElement) => {
      const panel = node.closest<HTMLElement>('[data-slot="stage"]');
      edge = panel ? panel.offsetWidth - node.clientWidth : 0;
    })}
  >
    {@render frame()}
  </div>
</section>
