<script lang="ts">
  /**
   * The transcript's foot dissolving under what stands on it: a pane draws
   * it while a composer stands over its transcript, in the transcript's own
   * layer, so the transcript's overlays ("Jump to latest") stand above it
   * and only its rows pass under.
   *
   * At rest it runs the clearance its pane names (`--composer-clearance`),
   * the very length the transcript's foot room is (Transcript `FOOT_ROOM`):
   * the last row at the tail ends where the fade begins, never under it. A
   * tab's composer floats over the transcript, so the fade runs under its
   * standing box; docked, the composer has its own place and the fade is a
   * thin edge at the scrollport's foot. With no clearance named it is
   * `--spacing-c-foot-fade`. It is solid at its foot. With `solid` (a length from
   * the foot) it is solid that high, then dissolves over `--spacing-space-8`: rows
   * pass behind it as they pass behind the pill, and nothing stands over
   * words being read.
   */
  import { fade } from "svelte/transition";

  let { solid }: { solid?: string } = $props();
</script>

<div
  data-slot="foot-fade"
  data-standing={solid !== undefined || undefined}
  aria-hidden="true"
  class="absolute inset-x-0 bottom-0 z-1 h-(--foot-fade-h) pointer-events-none bg-(image:--foot-fade-image) data-standing:bg-(image:--foot-fade-standing-image)"
  style:--fade-solid={solid ?? null}
  style:--foot-fade-h={solid === undefined
    ? "var(--composer-clearance, var(--spacing-c-foot-fade))"
    : `calc(${solid} + var(--spacing-space-8))`}
  style:--foot-fade-image={"linear-gradient(to top, var(--color-surface-recess) 22%, var(--color-surface-recess-clear))"}
  style:--foot-fade-standing-image={"linear-gradient(to top, var(--color-surface-recess) var(--fade-solid), var(--color-surface-recess-clear))"}
  transition:fade
></div>
