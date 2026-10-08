<script lang="ts">
  // The close glyph (Close.svelte) that turns into a back chevron and back
  // again: one icon whose role changes (dismiss, then back), drawn with the
  // same two strokes throughout so it morphs instead of swapping. Each stroke
  // is a line on its own angle; the chevron's arms are the X's strokes at
  // half their length, slid 3 units apart, so the change is a shorten and a
  // slide (transform and dash, both transitionable in every engine — a
  // path's `d` is not in WebKit). Same grammar as Close: 24px grid, 1.5
  // linear stroke, round caps, 1.2em box.
  import type { SVGAttributes } from "svelte/elements";

  let {
    back = false,
    ...rest
  }: { back?: boolean } & SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
  aria-hidden="true"
  class="close-back"
  data-back={back}
  fill="none"
  height="1.2em"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <!-- Each stroke runs ±8.485 (the X's half diagonal, 6√2) along its own axis. -->
  <line class="a" x1="-8.485" x2="8.485" y1="0" y2="0" />
  <line class="b" x1="-8.485" x2="8.485" y1="0" y2="0" />
</svg>

<style>
  line {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 16.97 40;
    stroke-dashoffset: 0;
    transform-box: view-box;
    transform-origin: 0 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    line {
      transition:
        transform var(--dur-morph) var(--ease-drawer),
        stroke-dasharray var(--dur-morph) var(--ease-drawer),
        stroke-dashoffset var(--dur-morph) var(--ease-drawer);
    }
  }
  /* X: (6,6)–(18,18) and (18,6)–(6,18). */
  .a {
    transform: translate(12px, 12px) rotate(45deg);
  }
  .b {
    transform: translate(12px, 12px) rotate(135deg);
  }
  /* ‹: (9,12)–(15,18) and (15,6)–(9,12), the middle half of each stroke. */
  [data-back="true"] line {
    stroke-dasharray: 8.485 40;
    stroke-dashoffset: -4.243;
  }
  [data-back="true"] .a {
    transform: translate(12px, 15px) rotate(45deg);
  }
  [data-back="true"] .b {
    transform: translate(12px, 9px) rotate(135deg);
  }
</style>
