<script lang="ts" module>
  import { type FrameObserver, frameObserver } from "../frame-observer";

  /** Each face's canvas waiting for the frame that first lays it out, and what paints it. */
  const waiting = new Map<Element, () => void>();
  let faces: FrameObserver | null = null;
  /** The faces' one observer: what each canvas waiting is painted with, written once every site has read. */
  function facesOf(): FrameObserver {
    faces ??= frameObserver(() => undefined, { inside: paintWaiting });
    return faces;
  }
  function paintWaiting(
    entries: readonly ResizeObserverEntry[]
  ): (() => void) | undefined {
    const draws: (() => void)[] = [];
    for (const entry of entries) {
      const draw = waiting.get(entry.target);
      if (draw) {
        waiting.delete(entry.target);
        faces?.unobserve(entry.target);
        draws.push(draw);
      }
    }
    return draws.length > 0
      ? () => {
          for (const draw of draws) {
            draw();
          }
        }
      : undefined;
  }
</script>

<script lang="ts">
  /**
   * Caw's still as a picture beside a word: `cawStill`'s shared drawing of
   * his file, copied onto this canvas in the frame that lays it out, after
   * that layout (frame-observer's `inside`), and again when the scheme
   * or the display changes. Copied as it mounted, its context laid the page
   * out again in the middle of the mount: each face a transcript's wheel
   * brought in cost its task a style and a layout (2.5ms on a CPU four
   * times slower, transcript-holds' steady wheel). A face put away is
   * painted when it is next laid out. Nothing plays and nothing fades.
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
    const { picture: ready } = still;
    if (ready) {
      waiting.set(canvas, () => put(ready));
      facesOf().observe(canvas);
      return () => {
        if (waiting.delete(canvas)) {
          faces?.unobserve(canvas);
        }
      };
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
  data-caw-face
  class="relative inline-block flex-none size-(--side) pointer-events-none select-none"
  data-box
  style:--bleed="{CAW_STILL_BLEED}px"
  style:--side="{size}px"
>
  <!-- A canvas is painted on whole device pixels wherever its row's layout
       puts it: the browser snaps a replaced box's painted rectangle to the
       grid, and the picture is copied one to one. So nothing moves it here: a
       sub-pixel translate to "align" it is a transform, which is not snapped,
       and it resamples the picture it was meant to sharpen. -->
  <canvas
    class="absolute inset-(--canvas-inset) size-(--canvas-side)"
    style:--canvas-inset="calc(var(--bleed) * -1)"
    style:--canvas-side="calc(var(--side) + 2 * var(--bleed))"
    {@attach paint}
  ></canvas>
</span>
