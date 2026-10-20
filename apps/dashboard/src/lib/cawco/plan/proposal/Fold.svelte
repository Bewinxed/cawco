<script lang="ts">
  /**
   * A step's body opening under it: transitions-dev's Accordion expand, the
   * fold the update notice already uses (DESIGN.md, Update notice). The
   * grid row goes 0fr to 1fr over --dur-panel and back over --dur-exit on
   * ease-out while the content fades and cross-blurs by --fold-blur; with
   * reduced motion it only fades. Shut, it is inert, so nothing in it takes
   * focus or a press.
   */
  import type { Snippet } from "svelte";

  let { open, id, children }: { open: boolean; id: string; children: Snippet } =
    $props();
</script>

<div class="fold" data-open={open || undefined} data-slot="fold-body" {id}>
  <div class="inner" inert={!open}>
    <div class="content">{@render children()}</div>
  </div>
</div>

<style>
  .fold {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--dur-exit) var(--ease-out);

    &[data-open] {
      grid-template-rows: 1fr;
      transition-duration: var(--dur-panel);
    }
  }
  /* No padding on the track: padding on a 0fr row leaves a strip. */
  .inner {
    min-block-size: 0;
    overflow: hidden;
  }
  .content {
    opacity: 0;
    transition: opacity var(--dur-exit) var(--ease-out);

    .fold[data-open] & {
      opacity: 1;
      transition-duration: var(--dur-panel);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .fold {
      transition-property: grid-template-rows;
    }
    .content {
      filter: blur(var(--fold-blur));
      transition-property: opacity, filter;

      /* Open, no filter at all: `none` interpolates from the blur as
         blur(0) does (w3.org/TR/filter-effects-1/#interpolation-of-filters:
         "Replace none with the corresponding <filter-value-list> of the
         other filter"), and the open content is then no filtered layer of
         its own, drawn as the rows around it are. */
      .fold[data-open] & {
        filter: none;
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fold {
      transition: none;
    }
  }
</style>
