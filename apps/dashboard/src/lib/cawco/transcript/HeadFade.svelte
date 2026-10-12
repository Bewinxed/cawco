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

<div aria-hidden="true" class="head-fade">
  {#each PROGRESSIVE_BLUR as layer, k (k)}
    <div
      class="layer"
      style="-webkit-backdrop-filter: {layerBlur(
        layer
      )}; backdrop-filter: {layerBlur(layer)}; mask-image: {layerMask(layer)}"
    ></div>
  {/each}
  <div class="layer tint"></div>
</div>

<style>
  .head-fade {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    z-index: 1;
    block-size: var(--c-head-fade);
    pointer-events: none;
  }
  .layer {
    position: absolute;
    inset: 0;
    /* Clear while nothing is under it: at rest, and whenever the transcript
       does not scroll (its timeline is inactive). */
    opacity: 0;
    animation: head-fade linear both;
    animation-timeline: --transcript-head;
    animation-range: 0 var(--c-head-fade);
  }
  /* The chosen tab's sheet, over the blur, on the ramp. */
  .tint {
    background: var(--tab-sheet);
    mask-image: var(--head-tint-ramp);
  }
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
</style>
