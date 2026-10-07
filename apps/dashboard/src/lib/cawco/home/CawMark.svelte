<script lang="ts" module>
  import { type CawStatus, stageCaw } from "./Caw.svelte";
  import CawFace from "./CawFace.svelte";
  import { CAW_STILL_BLEED, cawStill } from "./caw-still.svelte";

  /** The arrivals already played, by their id: one never plays twice. */
  const played = new Set<string>();
</script>

<script lang="ts">
  /**
   * Caw as a mark: his still at a few pixels, beside a word, on a row that
   * mounts and unmounts as its list scrolls. At rest it is his `CawFace`,
   * the shared picture of his still, so a row of these runs no Rive.
   *
   * `arrival` names the one time he comes in: the mark that gets it plays
   * the file's enter clip once on a canvas of its own, and in the frame the
   * clip lands on his still the face takes its place and the clip's Rive is
   * gone. An arrival already played, or one with less motion, is his face
   * from the start.
   *
   * `size` is the side of his still's box, which is the mark's layout box.
   * The canvases reach CAW_STILL_BLEED past it on every side, unclipped: his
   * dark rim sits a pixel outside the box, and his coming in acts a little
   * wider. If the runtime or the file does not load, the box stays empty.
   */
  import { untrack } from "svelte";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";

  let {
    status,
    size,
    arrival = null,
    delay = 0,
  }: {
    status: CawStatus;
    /** Side of his still's box in px: the mark's layout box. */
    size: number;
    /** The id of the one arrival this mark plays, or null to rest. */
    arrival?: string | null;
    /** How long after it mounts the arrival starts, in ms. */
    delay?: number;
  } = $props();

  /** Whether this mount is the arrival's one play. */
  let playing = $state(
    untrack(() => {
      if (arrival === null || played.has(arrival) || !motionOk.current) {
        return false;
      }
      played.add(arrival);
      return true;
    })
  );

  /** Plays his coming in once on this canvas, then hands over to his face. */
  function enter(canvas: HTMLCanvasElement) {
    const file = untrack(() => status);
    const wanted = untrack(() => cawStill(file, size));
    const wait = untrack(() => delay);
    canvas.width = wanted.backing;
    canvas.height = wanted.backing;
    let stop: (() => void) | undefined;
    let dispose: (() => void) | undefined;
    let here = true;
    const start = setTimeout(() => {
      stageCaw(file, canvas, wanted.box, wanted.dark)
        .then((stage) => {
          if (!here) {
            stage.dispose();
            return;
          }
          dispose = () => stage.dispose();
          stop = stage.enter(() => {
            playing = false;
          });
        })
        .catch((error: unknown) => {
          console.error(`Caw ${file} did not arrive`, error);
          playing = false;
        });
    }, wait);
    return () => {
      here = false;
      clearTimeout(start);
      stop?.();
      dispose?.();
    };
  }
</script>

<span
  aria-hidden="true"
  class="mark"
  style:--bleed="{CAW_STILL_BLEED}px"
  style:--side="{size}px"
  class:playing
>
  <CawFace {size} {status} />
  {#if playing}
    <canvas {@attach enter}></canvas>
  {/if}
</span>

<style>
  .mark {
    position: relative;
    display: inline-block;
    inline-size: var(--side);
    block-size: var(--side);
    pointer-events: none;
    user-select: none;

    & > :global(.face) {
      display: block;
    }
    /* His face is drawn and ready under the clip, unseen until it lands. */
    &.playing > :global(.face) {
      visibility: hidden;
    }
  }
  canvas {
    position: absolute;
    inset: calc(var(--bleed) * -1);
    inline-size: calc(var(--side) + 2 * var(--bleed));
    block-size: calc(var(--side) + 2 * var(--bleed));
  }
</style>
