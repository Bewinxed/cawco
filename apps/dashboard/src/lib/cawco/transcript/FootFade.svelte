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

<!-- literal: 96px, and the two gradients -->
<div
  data-standing={solid !== undefined || undefined}
  aria-hidden="true"
  class="absolute inset-x-0 bottom-0 z-1 h-(--foot-fade-h) pointer-events-none bg-(image:--foot-fade-image) data-standing:h-(--foot-fade-standing-h) data-standing:bg-(image:--foot-fade-standing-image)"
  style:--fade-solid={solid ?? null}
  style:--foot-fade-h="96px"
  style:--foot-fade-image="linear-gradient(to top, var(--surface-recess) 22%, var(--surface-recess-clear))"
  style:--foot-fade-standing-h="calc(var(--fade-solid) + var(--space-8))"
  style:--foot-fade-standing-image="linear-gradient(to top, var(--surface-recess) var(--fade-solid), var(--surface-recess-clear))"
  transition:fade
></div>
