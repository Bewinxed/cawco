<script lang="ts">
  /**
   * The canvas's chrome over the composer (CanvasStages) in a frame of its
   * own (its states file's): the grown shape's top as the stage draws it
   * over the composer, a raised surface rounded at `--radius-lg` (the grown
   * shape's radius, canvas-room's `size.r`), its top grab and its two corner
   * grips standing in it as the stage stands them, with no stage, iframe or
   * hub. The handles are inert here: a drag has no canvas to resize.
   */
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import CanvasGrip from "./CanvasGrip.svelte";
  import type { GrabValue, Handle } from "./stage.svelte";

  let {
    width,
    height,
  }: {
    /** The canvas's width, px. */
    width: number;
    /** The canvas's height, px. */
    height: number;
  } = $props();

  const HANDLES: Handle[] = ["top", "top-left", "top-right"];
  /** The grown shape's corner, as the composer's canvas room hands it the stage. */
  const corner = { inset: 0, radius: numberOf("--radius-lg") };
  const value: GrabValue = $derived({ min: 0, max: height, now: height });
  const still = () => undefined;
</script>

<div class="p-space-5">
  <div
    class="relative h-(--frame-h) w-(--frame-w) overflow-hidden rounded-t-lg border-b border-b-border-hairline bg-surface-raised"
    data-slot="canvas-stage"
    style:--frame-h={`${height}px`}
    style:--frame-w={`${width}px`}
  >
    {#each HANDLES as handle (handle)}
      <CanvasGrip
        {corner}
        {handle}
        ondown={still}
        onkey={still}
        text={`${width} by ${height}`}
        {value}
      />
    {/each}
  </div>
</div>
