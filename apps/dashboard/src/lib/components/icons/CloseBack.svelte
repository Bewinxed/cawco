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

<!-- literal: 12px, 15px, 9px (the stroke's centre on the 24px grid, and its slide for the chevron) -->
<svg
  aria-hidden="true"
  data-back={back}
  fill="none"
  height="1.2em"
  style:--mid="12px"
  style:--down="15px"
  style:--up="9px"
  viewBox="0 0 24 24"
  width="1.2em"
  xmlns="http://www.w3.org/2000/svg"
  {...rest}
>
  <!-- Each stroke runs ±8.485 (the X's half diagonal, 6√2) along its own axis. -->
  <line
    data-slot="a"
    class="stroke-current origin-top-left translate-x-(--mid) translate-y-(--mid) rotate-45 back-true:translate-y-(--down) motion-safe:transition-[translate,stroke-dasharray,stroke-dashoffset] motion-safe:dur-morph motion-safe:ease-drawer"
    data-back={back}
    x1="-8.485"
    x2="8.485"
    y1="0"
    y2="0"
  />
  <line
    class="stroke-current origin-top-left translate-x-(--mid) translate-y-(--mid) rotate-135 back-true:translate-y-(--up) motion-safe:transition-[translate,stroke-dasharray,stroke-dashoffset] motion-safe:dur-morph motion-safe:ease-drawer"
    data-back={back}
    x1="-8.485"
    x2="8.485"
    y1="0"
    y2="0"
  />
</svg>

<style>
  /* residual: svg-paint */
  line {
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 16.97 40;
    stroke-dashoffset: 0;
  }
  /* ‹: (9,12)–(15,18) and (15,6)–(9,12), the middle half of each stroke. */
  line[data-back="true"] {
    stroke-dasharray: 8.485 40;
    stroke-dashoffset: -4.243;
  }
  /* residual: unmapped */
  line {
    transform-box: view-box;
  }
</style>
