<script lang="ts">
  /**
   * Caw in one of his poses as a portrait: the pose's own `.riv`, framed on
   * his head and what he holds (core `CAW_POSES`), copied from `cawPortrait`'s
   * shared drawing onto this canvas, and again when the scheme or the display
   * changes. No Rive runs here once he is drawn. If the runtime or the file
   * does not load, the box stays empty.
   */
  import { CAW_POSES, type CawPoseId } from "@cawco/core/decides";
  import type { CawFile } from "./Caw.svelte";
  import { cawPortrait, copyStill, whenDrawn } from "./caw-still.svelte";

  let { pose, size }: { pose: CawPoseId; size: number } = $props();

  const posed = $derived(CAW_POSES.find((one) => one.id === pose));

  function paint(canvas: HTMLCanvasElement) {
    if (!posed) {
      return;
    }
    const file: CawFile = posed.file;
    const still = cawPortrait(file, posed.box, size);
    const put = (picture: HTMLCanvasElement) =>
      copyStill(canvas, still, picture);
    if (still.picture) {
      put(still.picture);
      return;
    }
    return whenDrawn(still, file, put);
  }
</script>

<span
  aria-hidden="true"
  class="pointer-events-none block size-(--side) flex-none select-none"
  style:--side="{size}px"
>
  <canvas class="block size-full" {@attach paint}></canvas>
</span>
