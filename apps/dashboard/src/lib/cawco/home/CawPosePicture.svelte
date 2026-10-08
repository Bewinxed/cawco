<script lang="ts">
  /**
   * A template pose as a picture: `cawPose`'s shared drawing of the pose's
   * file, copied onto this canvas, and again when the scheme or the display
   * changes. A pose is a rest with no drawn enter, so the first time his
   * picture lands here he fades in as the apps bring in a file with none
   * (assets/mascot/README.md, Contract: opacity 0 to 1 and scale from
   * --leave-scale over --dur-pop on --ease-out), then rests; with less motion
   * he is simply there. No Rive runs here once he is drawn.
   *
   * `size` is the picture's side, his whole artboard, which is the pose's
   * layout box. If the runtime or the file does not load, the box stays
   * empty.
   */
  import {
    dur,
    ease,
    motionOk,
    numberOf,
  } from "#lib/cawco/motion/curves.svelte.js";
  import type { CawPose } from "./Caw.svelte";
  import { cawPose } from "./caw-still.svelte";

  let {
    pose,
    size,
  }: {
    pose: CawPose;
    /** Side of his artboard in px: the pose's layout box. */
    size: number;
  } = $props();

  /** He has come in: a repaint for another scheme or display is simply there. */
  let landed = false;

  function paint(canvas: HTMLCanvasElement) {
    const file = pose;
    const still = cawPose(file, size);
    const put = (picture: HTMLCanvasElement) => {
      canvas.width = still.backing;
      canvas.height = still.backing;
      canvas.getContext("2d")?.drawImage(picture, 0, 0);
      if (landed) {
        return;
      }
      landed = true;
      if (motionOk.current) {
        canvas.animate(
          [
            { opacity: 0, transform: `scale(${numberOf("--leave-scale")})` },
            { opacity: 1, transform: "none" },
          ],
          { duration: dur("--dur-pop"), easing: ease("--ease-out") }
        );
      }
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

<span aria-hidden="true" class="pose" style:--side="{size}px">
  <canvas {@attach paint}></canvas>
</span>

<style>
  .pose {
    display: block;
    flex: none;
    inline-size: var(--side);
    block-size: var(--side);
    pointer-events: none;
    user-select: none;
  }
  canvas {
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }
</style>
