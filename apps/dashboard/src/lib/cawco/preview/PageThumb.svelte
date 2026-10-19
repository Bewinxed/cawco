<script lang="ts">
  /**
   * A page's thumbnail, wherever one is shown (the transcript's artifact
   * row): the picture in the reader's scheme, in a well (DESIGN.md
   * `surface-well` with `border-well`), so a page never stands as a white
   * slab on a dark panel. A page that looks the same in both schemes
   * (`single`: no dark styles of its own, or a preview keeping its own) has
   * one picture; at night it stands inset in the well, the well's ground
   * round it. A scheme with no picture drawn shows nothing.
   */
  import { theme } from "#lib/theme.svelte.js";
  import Shot from "../transcript/Shot.svelte";
  import type { PageThumbnail } from "./wire";

  let { thumbnail }: { thumbnail: PageThumbnail } = $props();

  const scheme = $derived(theme.resolved);
  const src = $derived(thumbnail[scheme]);
</script>

{#if src}
  <!-- Shot's own box and image take no class: they are reached from here.
       Their sizes are Shot's thumb's (48px, the image 100% of it, cover);
       here the box may shrink, the picture shows the page's top, and at
       night a single picture's corners follow the well's inset. -->
  <div
    data-slot="page-thumb"
    data-scheme={scheme}
    data-single={thumbnail.single || undefined}
    aria-hidden="true"
    class="h-(--tx-preview-thumb-h) w-(--tx-preview-thumb-w) shrink-0 overflow-hidden rounded-sm border border-border-well bg-surface-well data-single:data-[scheme=dark]:p-space-1 [&_[data-slot=shot-box]]:min-h-0 [&_img]:object-top data-single:data-[scheme=dark]:[&_img]:rounded-xs"
    inert
  >
    <Shot alt="Preview" size="thumb" src={`data:image/png;base64,${src}`} />
  </div>
{/if}
