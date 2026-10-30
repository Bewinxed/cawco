<script lang="ts" module>
  /**
   * How far up from the foot a FootFade covers: its solid run (`solid`) and
   * the `--space-8` it dissolves over above it, or, at rest, the whole
   * `--c-foot-fade`. A pane publishes it as `--foot-fade-run` over the
   * transcript it fades, whose foot room is never less (Transcript
   * `FOOT_ROOM`): the last row ends above the fade, never under it.
   */
  export const footFadeRun = (solid: string | undefined): string =>
    solid === undefined
      ? "var(--c-foot-fade)"
      : `calc(${solid} + var(--space-8))`;
</script>

<script lang="ts">
  /**
   * The transcript's foot dissolving under what stands on it: a pane draws
   * it while a composer stands over its transcript, in the transcript's own
   * layer, so the transcript's overlays ("Jump to latest") stand above it
   * and only its rows pass under.
   *
   * At rest it is 96px, solid at its foot. With `solid` (a length from the
   * foot) it is solid that high, then dissolves: rows pass behind it as they
   * pass behind the pill, and nothing stands over words being read. Its height is {@link footFadeRun}, the run its pane
   * publishes to the transcript's foot room.
   */
  import { fade } from "svelte/transition";

  let { solid }: { solid?: string } = $props();
</script>

<div
  data-standing={solid !== undefined || undefined}
  aria-hidden="true"
  class="absolute inset-x-0 bottom-0 z-1 h-(--foot-fade-h) pointer-events-none bg-(image:--foot-fade-image) data-standing:bg-(image:--foot-fade-standing-image)"
  style:--fade-solid={solid ?? null}
  style:--foot-fade-h={footFadeRun(solid)}
  style:--foot-fade-image={"linear-gradient(to top, var(--surface-recess) 22%, var(--surface-recess-clear))"}
  style:--foot-fade-standing-image={"linear-gradient(to top, var(--surface-recess) var(--fade-solid), var(--surface-recess-clear))"}
  transition:fade
></div>
