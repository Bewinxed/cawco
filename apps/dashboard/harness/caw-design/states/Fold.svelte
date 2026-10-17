<script lang="ts">
  /**
   * PROPOSED: what Details and Show more unfold, as the design's accordion:
   * its row grows from 0fr to 1fr over --dur-panel and folds back over
   * --dur-exit, both --ease-out, what it holds fading on the same clock.
   * Folded, it is inert, so nothing in it takes focus.
   */
  import type { Snippet } from "svelte";

  let { open, children }: { open: boolean; children: Snippet } = $props();
</script>

<div class="fold" class:open inert={!open}>
  <div class="inner">{@render children()}</div>
</div>

<style>
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    min-inline-size: 0;
    opacity: 0;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        grid-template-rows var(--dur-exit) var(--ease-out),
        opacity var(--dur-exit) var(--ease-out);
    }
    &.open {
      grid-template-rows: 1fr;
      opacity: 1;

      @media (prefers-reduced-motion: no-preference) {
        transition-duration: var(--dur-panel);
      }
    }
  }
  .inner {
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
  }
</style>
