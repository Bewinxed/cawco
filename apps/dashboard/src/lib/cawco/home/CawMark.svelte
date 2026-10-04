<script lang="ts" module>
  import { theme } from "#lib/theme.svelte.js";
  import { browser } from "$app/env";
  import { type CawStatus, stageCaw } from "./Caw.svelte";

  /**
   * The window's device pixel ratio, followed. A zoom changes it with the
   * viewport's size; a move to another display changes it alone, and the
   * resolution query that matched the old ratio says so once.
   */
  let ratio = $state(1);
  function follow(): void {
    ratio = devicePixelRatio;
    matchMedia(`(resolution: ${ratio}dppx)`).addEventListener(
      "change",
      follow,
      { once: true }
    );
  }
  if (browser) {
    follow();
    addEventListener("resize", () => {
      ratio = devicePixelRatio;
    });
  }

  /**
   * His rest, drawn from the status's file once for each look it can have
   * here (status, size, scheme, device pixels) and shared by every mark:
   * the picture, once it is drawn, and its drawing while it is on its way.
   */
  const drawn = new Map<string, HTMLCanvasElement>();
  const drawing = new Map<string, Promise<HTMLCanvasElement>>();

  interface Look {
    /** The canvas's side in its own pixels. */
    backing: number;
    box: { x: number; y: number; side: number };
    dark: boolean;
    key: string;
    status: CawStatus;
  }

  /** The look a mark of this status and size has now, in this scheme on this display. */
  function lookOf(status: CawStatus, size: number, bleed: number): Look {
    const dark = theme.resolved === "dark";
    const span = size + 2 * bleed;
    const backing = Math.round(span * ratio);
    const scale = backing / span;
    return {
      status,
      dark,
      backing,
      box: { x: bleed * scale, y: bleed * scale, side: size * scale },
      key: `${status}:${size}:${bleed}:${dark}:${backing}`,
    };
  }

  /**
   * Draws a mark's rest ahead of the first mark that will show it: for a
   * place that knows he is coming before his row is on screen.
   */
  export function warmCawMark(
    status: CawStatus,
    size: number,
    bleed: number
  ): void {
    restPicture(lookOf(status, size, bleed)).catch((error: unknown) => {
      console.error(`Caw ${status} did not draw`, error);
    });
  }

  function restPicture(look: Look): Promise<HTMLCanvasElement> {
    const known = drawing.get(look.key);
    if (known) {
      return known;
    }
    const canvas = document.createElement("canvas");
    canvas.width = look.backing;
    canvas.height = look.backing;
    const made = stageCaw(look.status, canvas, look.box, look.dark).then(
      (stage) => {
        stage.rest();
        stage.dispose();
        drawn.set(look.key, canvas);
        return canvas;
      }
    );
    // A drawing that failed is not kept: the next mark asks again.
    made.catch(() => drawing.delete(look.key));
    drawing.set(look.key, made);
    return made;
  }

  /** The arrivals already played, by their id: one never plays twice. */
  const played = new Set<string>();
</script>

<script lang="ts">
  /**
   * Caw as a mark: his still at a few pixels, beside a word, on a row that
   * mounts and unmounts as its list scrolls. A row of these must cost
   * nothing, so a mark at rest runs no Rive of its own: his rest is drawn
   * from the status's file once for each scheme and device pixel ratio, and
   * every mark copies that picture onto its canvas in the frame it mounts.
   * Nothing fades and nothing plays.
   *
   * `arrival` names the one time he comes in: the mark that gets it plays
   * the file's enter clip once on a canvas of its own, and in the frame the
   * clip lands on his still the shared picture takes its place and the clip's
   * Rive is gone. An arrival already played, or one with less motion, is
   * his rest from the start.
   *
   * `size` is the side of his still's box, which is the mark's layout box.
   * The canvas reaches `bleed` past it on every side, unclipped: his dark
   * rim sits a pixel outside the box, and his coming in acts a little wider.
   * If the runtime or the file does not load, the box stays empty.
   */
  import { untrack } from "svelte";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";

  let {
    status,
    size,
    bleed = 2,
    arrival = null,
    delay = 0,
  }: {
    status: CawStatus;
    /** Side of his still's box in px: the mark's layout box. */
    size: number;
    /** How far the canvas reaches past the box on each side, in px. */
    bleed?: number;
    /** The id of the one arrival this mark plays, or null to rest. */
    arrival?: string | null;
    /** How long after it mounts the arrival starts, in ms. */
    delay?: number;
  } = $props();

  const look = $derived(lookOf(status, size, bleed));

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

  /** Copies the shared rest onto this mark, and again when its look changes. */
  function rest(canvas: HTMLCanvasElement) {
    const wanted = look;
    const paint = (picture: HTMLCanvasElement) => {
      canvas.width = wanted.backing;
      canvas.height = wanted.backing;
      canvas.getContext("2d")?.drawImage(picture, 0, 0);
    };
    const ready = drawn.get(wanted.key);
    if (ready) {
      paint(ready);
      return;
    }
    let here = true;
    restPicture(wanted)
      .then((picture) => {
        if (here) {
          paint(picture);
        }
      })
      .catch((error: unknown) => {
        console.error(`Caw ${wanted.status} did not draw`, error);
      });
    return () => {
      here = false;
    };
  }

  /** Plays his coming in once on this canvas, then hands over to his rest. */
  function enter(canvas: HTMLCanvasElement) {
    const wanted = untrack(() => look);
    const wait = untrack(() => delay);
    canvas.width = wanted.backing;
    canvas.height = wanted.backing;
    let stop: (() => void) | undefined;
    let dispose: (() => void) | undefined;
    let here = true;
    const start = setTimeout(() => {
      stageCaw(wanted.status, canvas, wanted.box, wanted.dark)
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
          console.error(`Caw ${wanted.status} did not arrive`, error);
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
  style:--bleed="{bleed}px"
  style:--side="{size}px"
>
  <canvas class:waiting={playing} {@attach rest}></canvas>
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
  /* His rest is drawn and ready under the clip, unseen until it lands. */
  .waiting {
    visibility: hidden;
  }
</style>
