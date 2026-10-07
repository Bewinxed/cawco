<script lang="ts">
  /**
   * The transcript's foot dissolving under what stands on it: a pane draws
   * it while a composer stands over its transcript, in the transcript's own
   * layer, so the transcript's overlays ("Jump to latest") stand above it
   * and only its rows pass under.
   *
   * At rest it is 96px, solid at its foot. With `solid` (a length from the
   * foot: in a thread, up to Caw perched on the pill and the way back to the
   * latest beside him) it is solid that high, then dissolves: rows pass
   * behind him as they pass behind the pill, and neither stands over words
   * being read.
   */
  import { fade } from "svelte/transition";

  let { solid }: { solid?: string } = $props();
</script>

<div
  aria-hidden="true"
  class="foot-fade"
  style:--fade-solid={solid ?? null}
  class:standing={solid !== undefined}
  transition:fade
></div>

<style>
  .foot-fade {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 1;
    block-size: 96px;
    pointer-events: none;
    background: linear-gradient(
      to top,
      var(--surface-recess) 22%,
      oklch(from var(--surface-recess) l c h / 0)
    );
  }
  .foot-fade.standing {
    block-size: calc(var(--fade-solid) + var(--space-8));
    background: linear-gradient(
      to top,
      var(--surface-recess) var(--fade-solid),
      oklch(from var(--surface-recess) l c h / 0)
    );
  }
</style>
