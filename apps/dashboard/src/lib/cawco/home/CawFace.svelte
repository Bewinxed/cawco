<script lang="ts">
  /**
   * Caw's still as a picture beside a word: `cawStill`'s shared drawing of
   * his file, copied onto this canvas in the frame it mounts and again when
   * the scheme or the display changes. Nothing plays and nothing fades.
   *
   * `size` is the side of his still's box, which is the face's layout box;
   * the canvas reaches CAW_STILL_BLEED past it on every side, unclipped, for
   * his dark rim. If the runtime or the file does not load, the box stays
   * empty.
   */
  import type { CawFile } from "./Caw.svelte";
  import { CAW_STILL_BLEED, cawStill } from "./caw-still.svelte";

  let {
    status,
    size = 18,
  }: {
    status: CawFile;
    /** Side of his still's box in px: the face's layout box. */
    size?: number;
  } = $props();

  function paint(canvas: HTMLCanvasElement) {
    const file = status;
    const still = cawStill(file, size);
    const put = (picture: HTMLCanvasElement) => {
      canvas.width = still.backing;
      canvas.height = still.backing;
      canvas.getContext("2d")?.drawImage(picture, 0, 0);
    };
    if (still.picture) {
      put(still.picture);
      return;
    }
    let here = true;
    still.drawn
      .then((picture) => {
        if (here) {
          put(picture);
        }
      })
      .catch((error: unknown) => {
        console.error(`Caw ${file} did not draw`, error);
      });
    return () => {
      here = false;
    };
  }
</script>

<span
  aria-hidden="true"
  class="face"
  style:--bleed="{CAW_STILL_BLEED}px"
  style:--side="{size}px"
>
  <canvas {@attach paint}></canvas>
</span>

<style>
  .face {
    position: relative;
    display: inline-block;
    inline-size: var(--side);
    block-size: var(--side);
    pointer-events: none;
    user-select: none;
  }
  /* A canvas is painted on whole device pixels wherever its row's layout
     puts it: the browser snaps a replaced box's painted rectangle to the
     grid, and the picture is copied one to one. So nothing moves it here: a
     sub-pixel translate to "align" it is a transform, which is not snapped,
     and it resamples the picture it was meant to sharpen. */
  canvas {
    position: absolute;
    inset: calc(var(--bleed) * -1);
    inline-size: calc(var(--side) + 2 * var(--bleed));
    block-size: calc(var(--side) + 2 * var(--bleed));
  }
</style>
