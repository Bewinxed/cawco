<script lang="ts">
  /**
   * A demonstration at its real size: a frame exactly as wide as the device
   * it stands for, at that device's height, never scaled. Wider than the
   * room it has, it scrolls sideways inside its own well and never moves
   * the page round it. What it holds lays itself out to the frame (the
   * list's container queries), so a phone frame draws the phone.
   */
  import type { Snippet } from "svelte";
  import { SIZES, type Size } from "./request";

  let {
    size,
    label,
    height,
    children,
  }: {
    size: Size;
    /** What the frame shows, for the screen reader: the answer's name and the device. */
    label: string;
    /** A height of its own, under the device's, where the structure gives it less. */
    height?: number;
    children: Snippet;
  } = $props();

  const box = $derived(SIZES[size]);
</script>

<figure
  class="m-0 max-w-full overflow-x-auto overscroll-x-contain"
  aria-label={label}
>
  <div
    class="h-(--frame-h) w-(--frame-w) overflow-clip rounded-lg border border-border-hairline bg-surface-page shadow-tile"
    style:--frame-w="{box.w}px"
    style:--frame-h="{height ?? box.h}px"
  >
    {@render children()}
  </div>
</figure>
