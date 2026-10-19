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
  <div
    data-slot="page-thumb"
    data-scheme={scheme}
    data-single={thumbnail.single || undefined}
    aria-hidden="true"
    class="page-thumb"
    inert
  >
    <Shot alt="Preview" size="thumb" src={`data:image/png;base64,${src}`} />
  </div>
{/if}

<style>
  .page-thumb {
    inline-size: var(--tx-preview-thumb-w);
    block-size: var(--tx-preview-thumb-h);
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);

    & :global(.box) {
      block-size: 100%;
      min-block-size: 0;
    }
    & :global(img) {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      object-position: top;
    }
    /* A page with no dark of its own, at night: inset, the well round it. */
    &[data-single][data-scheme="dark"] {
      padding: var(--space-1);

      & :global(img) {
        border-radius: var(--radius-xs);
      }
    }
  }
</style>
