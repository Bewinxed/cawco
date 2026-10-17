<!--
  The transcript's head dissolving into the chosen tab: rows scrolled up past
  the transcript's top edge blur progressively toward it, up to
  `--c-head-fade-blur` at the edge over `--c-head-fade`, and dissolve into the
  chosen tab's sheet (`--tab-sheet`, the fill PaneTabs paints the tab in), so
  at the edge they have become the tab's fill and the transcript and its tab
  read as one sheet (owner: "it should not just be a blur, but it should blur
  into the color of the highlighted tab"). A pane draws it beside FootFade, in
  the transcript's own layer, so the transcript's overlays stand above it and
  only its rows pass under.

  The blur is the app's progressive blur (progressive-blur.ts): its layers,
  their blurs and their slices are drawn from there. The colour is one layer
  over them, the tab's sheet through `--head-tint-ramp`: none at the band's
  foot, the sheet whole at the edge, on inOutCubic, the curve the blur's
  slices are bounded on, so the two arrive together. Flat at both ends: no
  line where the band starts on the rows, none where it meets the tab's foot.
  It reads the very token the tab's sheet does, so whatever changes the one
  changes the other in the same frame.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--c-head-fade` of scroll. The pane names the transcript's
  scroll timeline in scope (`timeline-scope: --transcript-head`); Transcript's
  scroller is that timeline. The fade-in is on each layer, never on the band:
  an ancestor below full opacity is a backdrop root, and the layers in it would
  have only each other to blur.
-->
<script lang="ts">
  import { layerBlur, layerMask, PROGRESSIVE_BLUR } from "./progressive-blur";
</script>

<div
  data-slot="head-fade"
  aria-hidden="true"
  class="absolute inset-x-0 top-0 z-1 h-c-head-fade pointer-events-none"
>
  <!-- Each layer clear while nothing is under it: at rest, and whenever the
       transcript does not scroll (its timeline is inactive). -->
  {#each PROGRESSIVE_BLUR as layer, k (k)}
    <!-- The layer's blur and its slice (progressive-blur.ts). -->
    <div
      data-slot="layer"
      class="absolute inset-0 opacity-0 backdrop-filter-(--layer-blur) mask-(--layer-mask)"
      style:--layer-blur={layerBlur(layer)}
      style:--layer-mask={layerMask(layer)}
    ></div>
  {/each}
  <!-- The chosen tab's sheet, over the blur, on the ramp. It sets no blur,
       so it draws none. -->
  <div
    data-slot="layer"
    class="absolute inset-0 opacity-0 bg-tab-sheet backdrop-filter-(--layer-blur) mask-(--layer-mask)"
    style:--layer-mask="var(--head-tint-ramp)"
  ></div>
</div>

<style>
  /* residual: keyframes — the animation, then its scroll timeline and range
     (animation longhands of the same animation), after the shorthand that
     resets them, in the same rule */
  [data-slot="layer"] {
    animation: head-fade linear both;
    animation-timeline: --transcript-head;
    animation-range: 0 var(--c-head-fade);
  }
  /* residual: keyframes */
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
</style>
